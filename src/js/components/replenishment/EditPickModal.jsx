import React, { Component } from 'react';
import _ from 'lodash';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { getTranslate } from 'react-localize-redux';

import ModalWrapper from '../form-elements/ModalWrapper';
import LabelField from '../form-elements/LabelField';
import TextField from '../form-elements/TextField';
import ArrayField from '../form-elements/ArrayField';
import apiClient from '../../utils/apiClient';
import { showSpinner, hideSpinner } from '../../actions';
import Translate, { translateWithDefaultMessage } from '../../utils/Translate';

const FIELDS = {
  availableItems: {
    type: ArrayField,
    getDynamicRowAttr: ({ rowValues }) => {
      let className = '';
      if (!rowValues.quantityAvailable) {
        className = 'text-disabled';
      }
      return { className };
    },
    fields: {
      status: {
        type: LabelField,
        fieldKey: '',
        flexWidth: '2',
        getDynamicAttr: ({ translate }) => ({
          showValueTooltip: true,
          formatValue: (fieldValue) => {
            if (!fieldValue.status || fieldValue.status === 'AVAILABLE') {
              return '';
            }

            return translate(`react.stockMovement.enum.AvailableItemStatus.${fieldValue.status}`, fieldValue.status);
          },
        }),
      },
      lotNumber: {
        type: LabelField,
        label: 'react.stockMovement.lot.label',
        defaultMessage: 'Lot',
      },
      expirationDate: {
        type: LabelField,
        label: 'react.stockMovement.expiry.label',
        defaultMessage: 'Expiry',
        fixedWidth: '120px',
      },
      'zone.name': {
        type: LabelField,
        label: 'react.stockMovement.binLocation.label',
        defaultMessage: 'Zone',
      },
      'binLocation.name': {
        type: LabelField,
        label: 'react.stockMovement.binLocation.label',
        defaultMessage: 'Bin Location',
      },
      quantityAvailable: {
        type: LabelField,
        label: 'react.stockMovement.quantityAvailable.label',
        defaultMessage: 'Qty Available',
        fixedWidth: '150px',
        attributes: {
          formatValue: value => (value || value === 0 ? value.toLocaleString('en-US') : null),
        },
      },
      quantityPicked: {
        type: TextField,
        fieldKey: '',
        label: 'react.stockMovement.quantityPicked.label',
        defaultMessage: 'Qty Picked',
        fixedWidth: '120px',
        attributes: {
          type: 'number',
        },
        getDynamicAttr: ({ fieldValue }) => ({
          disabled: fieldValue && !fieldValue.quantityAvailable,
        }),
      },
    },
  },
};

function validate(values) {
  const errors = {};
  errors.availableItems = [];

  const pickedSum = _.reduce(
    values.availableItems, (sum, val) =>
      (sum + (val.quantityPicked ? _.toInteger(val.quantityPicked) : 0)),
    0,
  );

  _.forEach(values.availableItems, (item, key) => {
    if (item.quantityPicked && pickedSum !== values.quantityRequired) {
      errors.availableItems[key] = { quantityPicked: 'react.stockMovement.errors.differentTotalQty.label' };
    }
    if (item.quantityPicked > item.quantityAvailable) {
      errors.availableItems[key] = { quantityPicked: 'react.stockMovement.errors.higherTyPicked.label' };
    }
    if (item.quantityPicked < 0) {
      errors.availableItems[key] = { quantityPicked: 'react.stockMovement.errors.negativeQtyPicked.label' };
    }
  });

  return errors;
}

/** Modal window where user can edit pick. */
/* eslint no-param-reassign: "error" */
class EditPickModal extends Component {
  constructor(props) {
    super(props);

    const {
      fieldConfig: { attributes, getDynamicAttr },
    } = props;
    const dynamicAttr = getDynamicAttr ? getDynamicAttr(props) : {};
    const attr = { ...attributes, ...dynamicAttr };

    this.state = {
      attr,
      formValues: {},
    };

    this.onOpen = this.onOpen.bind(this);
    this.onSave = this.onSave.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    const {
      fieldConfig: { attributes, getDynamicAttr },
    } = nextProps;
    const dynamicAttr = getDynamicAttr ? getDynamicAttr(nextProps) : {};
    const attr = { ...attributes, ...dynamicAttr };

    this.setState({ attr });
  }

  /**
   * Loads chosen items, required quantity and reason codes into modal's form.
   * @public
   */
  onOpen() {
    this.fetchPickPageItem();
  }

  /**
   * Sends all changes made by user in this modal to API and updates data.
   * @param {object} values
   * @public
   */
  onSave(values) {
    this.props.showSpinner();

    const picklistUrl = `/openboxes/api/replenishments/${this.state.attr.itemId}/picklists`;
    const payload = {
      picklistItems: _.map(values.availableItems, avItem => ({
        id: avItem.id || '',
        'inventoryItem.id': avItem['inventoryItem.id'],
        'binLocation.id': avItem['binLocation.id'] || '',
        quantityPicked: _.isNil(avItem.quantityPicked) ? '' : avItem.quantityPicked,
      })),
    };

    apiClient.put(picklistUrl, payload)
      .then(() => {
        this.props.hideSpinner();
        this.state.attr.onResponse();
      })
      .catch(() => { this.props.hideSpinner(); });
  }

  /**
   * Sums up quantity picked from all available items.
   * @param {object} values
   * @public
   */
  /* eslint-disable-next-line class-methods-use-this */
  calculatePicked(values) {
    return (
      <div>
        <div className="font-weight-bold pb-2">
          <Translate id="react.stockMovement.quantityPicked.label" defaultMessage="Qty Picked" />: {_.reduce(values.availableItems, (sum, val) =>
            (sum + (val.quantityPicked ? _.toInteger(val.quantityPicked) : 0)), 0)}
        </div>
        <hr />
      </div>
    );
  }

  fetchPickPageItem() {
    const itemsUrl = `/openboxes/api/replenishments/${this.state.attr.itemId}/picklists`;

    apiClient.get(itemsUrl)
      .then((resp) => {
        const pickPageItem = resp.data.data;

        const availableItems = _.map(pickPageItem.availableItems, (avItem) => {
          // check if this picklist item already exists
          const picklistItem = _.find(pickPageItem.picklistItems, item => item['inventoryItem.id'] === avItem['inventoryItem.id'] && item['binLocation.id'] === avItem['binLocation.id']);

          if (picklistItem) {
            return {
              ...avItem,
              id: picklistItem.id,
              quantityPicked: picklistItem.quantityPicked,
              binLocation: {
                id: picklistItem['binLocation.id'],
                name: picklistItem['binLocation.name'],
                zoneName: picklistItem['binLocation.zoneName'],
              },
            };
          }

          return {
            ...avItem,
            binLocation: {
              id: avItem['binLocation.id'],
              name: avItem['binLocation.name'],
              zoneName: avItem['binLocation.zoneName'],
            },
          };
        });

        this.setState({
          formValues: {
            availableItems,
            quantityRequired: pickPageItem.quantityRequired,
            productCode: pickPageItem.productCode,
            productName: pickPageItem['product.name'],
          },
        });

        this.props.hideSpinner();
      })
      .catch(() => { this.props.hideSpinner(); });
  }

  render() {
    if (this.state.attr.subfield) {
      return null;
    }

    return (
      <ModalWrapper
        {...this.state.attr}
        onOpen={this.onOpen}
        onSave={this.onSave}
        fields={FIELDS}
        validate={validate}
        initialValues={this.state.formValues}
        formProps={{
          translate: this.props.translate,
        }}
        renderBodyWithValues={this.calculatePicked}
      >
        <div>
          <div className="font-weight-bold">
            <Translate id="react.stockMovement.productCode.label" defaultMessage="Product code" />: {this.state.formValues.productCode}
          </div>
          <div className="font-weight-bold">
            <Translate id="react.stockMovement.productName.label" defaultMessage="Product name" />: {this.state.formValues.productName}
          </div>
          <div className="font-weight-bold">
            <Translate id="react.stockMovement.quantityRequired.label" defaultMessage="Qty Required" />: {this.state.formValues.quantityRequired}
          </div>
        </div>
      </ModalWrapper>
    );
  }
}

const mapStateToProps = state => ({
  translate: translateWithDefaultMessage(getTranslate(state.localize)),
});

export default connect(mapStateToProps, { showSpinner, hideSpinner })(EditPickModal);

EditPickModal.propTypes = {
  /** Name of the field */
  fieldName: PropTypes.string.isRequired,
  /** Configuration of the field */
  fieldConfig: PropTypes.shape({
    getDynamicAttr: PropTypes.func,
  }).isRequired,
  /** Function called when data is loading */
  showSpinner: PropTypes.func.isRequired,
  /** Function called when data has loaded */
  hideSpinner: PropTypes.func.isRequired,
  /** Is true when currently selected location supports bins */
  translate: PropTypes.func.isRequired,
};